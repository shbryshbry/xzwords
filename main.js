'use strict';
/* ============================================================
 * xz背单词 单机版 — Electron 主进程
 * ============================================================ */
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./lib/store');
const imp = require('./lib/importer');

/* 纯 DOM 应用，禁用 GPU 硬解以最大化兼容性（透明窗口/远程桌面/老机器） */
app.disableHardwareAcceleration();
/* 兼容性：部分机器 Chromium 沙箱引导失败会启动即崩（0x80000003），关闭沙箱 */
app.commandLine.appendSwitch('no-sandbox');

/* 文件日志（Windows GUI 子系统不接控制台，落盘最可靠；放 userData 便于用户反馈） */
let LOGF = '';
try { LOGF = path.join(app.getPath('userData'), 'main.log'); } catch (e) { LOGF = 'momo-main.log'; }
function flog(msg) {
  try { fs.appendFileSync(LOGF, new Date().toISOString() + ' ' + msg + '\n'); } catch (e) {}
}
flog('---- main 启动 ----');
process.on('uncaughtException', function (e) { flog('UNCAUGHT: ' + (e && e.stack || e)); });

const ROOT = __dirname;

/* 冒烟测试用独立数据目录：必须在 requestSingleInstanceLock 之前设置 */
if (process.env.MOMO_SMOKE) {
  try { app.setPath('userData', path.join(app.getPath('appData'), 'xz背单词-smoke')); } catch (e) {}
}
let win = null;              /* 主窗口 */
let tray = null;
let carouselWin = null;
let choiceWin = null;
const stickerWins = {};      /* stickerId -> BrowserWindow */
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.setAppUserModelId('com.xz.english');

/* ---------------- 数据目录（含从旧应用名迁移） ---------------- */
function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}
function migrateDataDir() {
  const newData = dataDir();
  const oldData = path.join(app.getPath('appData'), 'xz学英语', 'data');
  try {
    if (!fs.existsSync(newData) && fs.existsSync(oldData)) {
      fs.cpSync(oldData, newData, { recursive: true });
      flog('数据已迁移: ' + oldData + ' -> ' + newData);
    }
  } catch (e) { flog('数据迁移失败 ' + (e && e.message)); }
}

/* 首次启动（无任何词库且未初始化过）：自动导入随应用内置的三大全词库 */
function seedBuiltinBooks() {
  try {
    if (store.getSettings().builtinSeeded) return;
    const bundled = path.join(ROOT, 'assets', 'bundled-books.json');
    if (!fs.existsSync(bundled)) return;
    if (store.listBooks().length > 0) { store.updateSettings({ builtinSeeded: true }); return; }
    const data = JSON.parse(fs.readFileSync(bundled, 'utf8'));
    let first = null;
    (data.books || []).forEach(function (b) {
      const created = store.createBook({ name: b.name, desc: (b.desc || '') + ' · 词库来源：百词斩', color: b.color });
      store.addWords(created.id, b.words || []);
      if (!first) first = created;
    });
    store.updateSettings({ builtinSeeded: true, activeBookId: first ? first.id : null });
    flog('内置词库导入完成: ' + (data.books || []).length + ' 本');
  } catch (e) { flog('内置词库导入失败 ' + (e && e.message)); }
}

/* ---------------- 通用 IPC 包装 ---------------- */
function handle(channel, fn) {
  ipcMain.handle(channel, async function (event, payload) {
    try {
      return { ok: true, data: await fn(payload, event) };
    } catch (e) {
      console.error('[IPC]', channel, e);
      return { ok: false, error: (e && e.message) || String(e) };
    }
  });
}
function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach(function (w) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  });
}

/* 读取文本文件：UTF-8 优先，检出乱码（替换符）时按 GBK 重试（记事本 ANSI 常见） */
function readTextAuto(p) {
  const buf = fs.readFileSync(p);
  let text = buf.toString('utf8');
  if (text.indexOf('\uFFFD') >= 0) {
    try {
      const dec = new TextDecoder('gbk');
      const gbk = dec.decode(buf);
      /* GBK 解码不再产生替换符时认为它是 ANSI 文件 */
      if (gbk.indexOf('\uFFFD') < 0) text = gbk.replace(/^\uFEFF/, '');
    } catch (e) { /* 无 GBK 解码器则保持原样 */ }
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text;
}

function hookConsole(w) {
  w.webContents.on('console-message', function (e) {
    const lv = e && e.level != null ? e.level : 3;
    const msg = (e && e.message) || '';
    if (process.env.MOMO_SMOKE) console.log('[wconsole' + lv + ']', msg);
    else if (lv >= 3) console.log('[widget-renderer]', msg, (e && e.sourceId) + ':' + (e && e.lineNumber));
  });
}

/* ---------------- 主窗口 ---------------- */
function iconPath() {
  const p = path.join(ROOT, 'assets', 'icon.png');
  return fs.existsSync(p) ? p : null;
}
function createMain() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1000, minHeight: 640,
    backgroundColor: '#f4f6fb', autoHideMenuBar: true,
    title: 'xz背单词',
    icon: iconPath() || undefined,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      spellcheck: false
    }
  });
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'), process.env.MOMO_SMOKE ? { search: 'smoke=1' } : undefined);
  win.once('ready-to-show', function () { win.show(); });
  win.on('close', function (e) {
    if (!quitting) { e.preventDefault(); win.hide(); }  /* 关闭=驻留托盘 */
  });
  win.on('closed', function () { win = null; });
  hookConsole(win);
  win.webContents.on('render-process-gone', function (e, details) {
    console.error('[renderer-gone]', details && details.reason);
  });
}

/* ---------------- 桌面插件窗口 ---------------- */
function toggleCarousel(force) {
  const s = store.getSettings();
  const want = force != null ? !!force : !(carouselWin && !carouselWin.isDestroyed());
  if (!want) {
    if (carouselWin && !carouselWin.isDestroyed()) carouselWin.close();
    return false;
  }
  if (!carouselWin || carouselWin.isDestroyed()) {
    const { screen } = require('electron');
    const wa = screen.getPrimaryDisplay().workArea;
    const ccc = (store.getSettings().widget && store.getSettings().widget.carousel) || {};
    carouselWin = new BrowserWindow({
      x: wa.x + wa.width - (ccc.w || 360) - 30, y: wa.y + wa.height - (ccc.h || 250) - 90,
      width: ccc.w || 360, height: ccc.h || 250,
      transparent: true, frame: false, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false,
      webPreferences: {
        preload: path.join(ROOT, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: false
      }
    });
    carouselWin.loadFile(path.join(ROOT, 'widgets', 'carousel.html'));
    carouselWin.once('ready-to-show', function () { carouselWin.showInactive(); });
    hookConsole(carouselWin);
    carouselWin.on('closed', function () {
      carouselWin = null;
      store.updateSettings({ widget: { carousel: { on: false } } });
      broadcast('widgets:state', widgetState());
      updateTray();
    });
  }
  store.updateSettings({ widget: { carousel: { on: true } } });
  broadcast('widgets:state', widgetState());
  updateTray();
  return true;
}

function toggleChoice(force) {
  const want = force != null ? !!force : !(choiceWin && !choiceWin.isDestroyed());
  if (!want) {
    if (choiceWin && !choiceWin.isDestroyed()) choiceWin.close();
    return false;
  }
  if (!choiceWin || choiceWin.isDestroyed()) {
    const { screen } = require('electron');
    const wa = screen.getPrimaryDisplay().workArea;
    const ccfg = (store.getSettings().widget && store.getSettings().widget.choice) || {};
    choiceWin = new BrowserWindow({
      x: wa.x + 40, y: wa.y + wa.height - (ccfg.h || 330) - 90,
      width: ccfg.w || 380, height: ccfg.h || 330,
      transparent: true, frame: false, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false, focusable: false,
      webPreferences: {
        preload: path.join(ROOT, 'preload.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: false
      }
    });
    choiceWin.setAlwaysOnTop(true, 'screen-saver');
    choiceWin.loadFile(path.join(ROOT, 'widgets', 'choice.html'));
    choiceWin.once('ready-to-show', function () { choiceWin.showInactive(); });
    choiceWin.on('closed', function () {
      choiceWin = null;
      KB_KEYS.forEach(function (k) { try { globalShortcut.unregister(k); } catch (e) {} });
      store.updateSettings({ widget: { choice: { on: false } } });
      broadcast('widgets:state', widgetState());
      updateTray();
    });
  }
  store.updateSettings({ widget: { choice: { on: true } } });
  broadcast('widgets:state', widgetState());
  updateTray();
  return true;
}

function openSticker(st) {
  if (stickerWins[st.id] && !stickerWins[st.id].isDestroyed()) return;
  let x = st.x, y = st.y;
  /* 未指定位置的贴纸：从屏幕右下角向左上层叠排布，避免全部叠在中心 */
  if (x == null || y == null) {
    const { screen } = require('electron');
    const wa = screen.getPrimaryDisplay().workArea;
    const n = Object.keys(stickerWins).length;
    x = wa.x + wa.width - 270 - (n % 6) * 40;
    y = wa.y + wa.height - 200 - (n % 6) * 36;
    store.updateSticker(st.id, { x: x, y: y });
  }
  const w = new BrowserWindow({
    x: x, y: y,
    width: st.w || 250, height: st.h || 170,
    transparent: true, frame: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  w.loadFile(path.join(ROOT, 'widgets', 'sticker.html'), { query: { sid: st.id } });
  w.once('ready-to-show', function () { w.showInactive(); });
  hookConsole(w);
  w.on('moved', function () {
    if (w.isDestroyed()) return;
    const b = w.getBounds();
    store.updateSticker(st.id, { x: b.x, y: b.y });
  });
  w.on('closed', function () { delete stickerWins[st.id]; });
  stickerWins[st.id] = w;
}

function syncStickers() {
  const list = store.listStickers();
  const ids = {};
  list.forEach(function (st) {
    ids[st.id] = 1;
    openSticker(st);
  });
  Object.keys(stickerWins).forEach(function (id) {
    if (!ids[id] && stickerWins[id] && !stickerWins[id].isDestroyed()) stickerWins[id].close();
  });
}

function closeAllStickers() {
  Object.keys(stickerWins).forEach(function (id) {
    if (stickerWins[id] && !stickerWins[id].isDestroyed()) stickerWins[id].close();
  });
}

function widgetState() {
  const s = store.getSettings();
  return {
    carousel: { on: !!(carouselWin && !carouselWin.isDestroyed()), conf: s.widget.carousel },
    choice: { on: !!(choiceWin && !choiceWin.isDestroyed()), conf: s.widget.choice },
    sticker: { count: store.listStickers().length, conf: s.widget.sticker }
  };
}

/* ---------------- 托盘 ---------------- */
function updateTray() {
  if (!tray) return;
  const st = widgetState();
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: function () { showMain(); } },
    { type: 'separator' },
    { label: '桌面轮播', type: 'checkbox', checked: st.carousel.on, click: function () { toggleCarousel(); } },
    { label: '选题浮窗', type: 'checkbox', checked: st.choice.on, click: function () { toggleChoice(); } },
    { label: '清空桌面贴纸', enabled: st.sticker.count > 0, click: function () { store.listStickers().forEach(function (s) { store.deleteSticker(s.id); }); syncStickers(); broadcast('stickers:changed', store.listStickers()); } },
    { type: 'separator' },
    { label: '退出', click: function () { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

function showMain() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  else createMain();
}

function createTray() {
  const ip = iconPath();
  if (!ip) return;
  tray = new Tray(nativeImage.createFromPath(ip));
  tray.setToolTip('xz背单词');
  updateTray();
  tray.on('double-click', showMain);
}

/* ---------------- IPC 注册 ---------------- */
function registerIpc() {
  handle('settings:get', function () { return store.getSettings(); });
  handle('settings:set', function (patch) {
    const s = store.updateSettings(patch);
    broadcast('settings:changed', s);
    /* 插件开关联动 */
    const w = patch && patch.widget;
    if (w) {
      if (w.carousel && w.carousel.on != null) toggleCarousel(w.carousel.on);
      if (w.choice && w.choice.on != null) toggleChoice(w.choice.on);
    }
    if (patch && patch.stickerSpace != null) syncStickers();
    return s;
  });

  handle('books:list', function () { return store.listBooks(); });
  handle('books:create', function (o) { return store.createBook(o); });
  handle('books:delete', function (id) {
    const ok = store.deleteBook(id);
    syncStickers();
    broadcast('stickers:changed', store.listStickers());
    return ok;
  });
  handle('books:update', function (o) { return store.renameBook(o.id, o.name, o.patch); });
  handle('book:data', function (bookId) {
    return {
      book: store.getBook(bookId),
      words: store.getWords(bookId),
      prog: store.getProg(bookId),
      counts: store.counts(bookId)
    };
  });

  handle('import:text', function (o) {
    const parsed = imp.parseImport(o.text);
    const r = store.addWords(o.bookId, parsed.words);
    return { added: r.added, dup: r.dup, bad: parsed.bad, format: parsed.format, total: parsed.total };
  });
  handle('import:file', function (o) {
    const paths = o && o.paths;
    let results = [];
    (paths || []).forEach(function (p) {
      const text = readTextAuto(p);
      const parsed = imp.parseImport(text);
      const r = store.addWords(o.bookId, parsed.words);
      results.push({ file: path.basename(p), added: r.added, dup: r.dup, bad: parsed.bad, format: parsed.format, total: parsed.total });
    });
    return results;
  });
  handle('import:pick', async function (o) {
    const r = await dialog.showOpenDialog(win, {
      title: '选择词库文件',
      filters: [{ name: '词库文件', extensions: ['json', 'jsonl', 'txt', 'csv'] }],
      properties: ['openFile', 'multiSelections']
    });
    return r.canceled ? [] : r.filePaths;
  });

  handle('words:addOne', function (o) {
    const w = imp.normalizeOne({ word: o.word, trans: o.trans ? [{ pos: o.pos || '', cn: o.trans, en: '' }] : [] });
    if (!w) throw new Error('单词为空');
    return store.addWords(o.bookId, [w]);
  });
  handle('words:update', function (o) { return store.updateWord(o.bookId, o.wordId, o.patch); });
  handle('words:delete', function (o) {
    const n = store.deleteWords(o.bookId, o.ids);
    const remain = store.listStickers().filter(function (s) { return s.bookId === o.bookId && o.ids.indexOf(s.wordId) >= 0; });
    remain.forEach(function (s) { store.deleteSticker(s.id); });
    if (remain.length) { syncStickers(); broadcast('stickers:changed', store.listStickers()); }
    return n;
  });
  handle('words:flags', function (o) { return store.setFlags(o.bookId, o.ids, o.flags); });
  handle('words:touch', function (o) { return store.touchShown(o.bookId, o.ids); });
  handle('word:detail', function (o) {
    const w = store.getWords(o.bookId).find(function (x) { return x.id === o.wordId; });
    return w || null;
  });

  handle('learn:queue', function (o) {
    const q = store.buildQueue(o.bookId, o.opts);
    return { queue: q, counts: store.counts(o.bookId), todayNew: store.todayNewCount() };
  });
  handle('learn:rate', function (o) {
    const bookId = o.bookId || store.getSettings().activeBookId;
    if (!bookId) return { ok: false, error: 'no-active-book' };
    const r = store.rate(bookId, o.wordId, o.rating, {});
    return r;
  });

  handle('known:list', function () { return store.listKnown(); });
  handle('known:set', function (o) { return store.setKnown(o.words, o.val); });

  handle('forecast', function (o) { return store.forecast(o.bookId, o.days || 30); });
  handle('forecast:detail', function (o) { return store.forecastDetail(o.bookId, o.date); });
  handle('stats', function () { return store.statsAll(); });

  handle('seq:get', function (bookId) { return store.getSeq(bookId); });
  handle('seq:set', function (o) { store.setSeq(o.bookId, o.pos); return true; });

  handle('stickers:list', function () { return store.listStickers(); });
  handle('stickers:create', function (s) {
    const st = store.createSticker(s);
    syncStickers();
    broadcast('stickers:changed', store.listStickers());
    return st;
  });
  handle('stickers:update', function (o) {
    const st = store.updateSticker(o.id, o.patch);
    if (o.patch && (o.patch.space != null)) syncStickers();
    broadcast('stickers:changed', store.listStickers());
    return st;
  });
  handle('stickers:delete', function (id) {
    const ok = store.deleteSticker(id);
    syncStickers();
    broadcast('stickers:changed', store.listStickers());
    return ok;
  });

  handle('widget:words', function (o) {
    o = o || {};
    const s = store.getSettings();
    const ws = s.widgetSource || {};
    const bookId = o.bookId || ws.bookId || s.activeBookId;
    if (!bookId) return [];
    return store.widgetWords(bookId, o.kind || ws.kind || 'all', o.n || 10);
  });
  handle('widget:state', function () { return widgetState(); });
  handle('widget:carousel', function (on) { return toggleCarousel(on); });
  handle('widget:choice', function (on) { return toggleChoice(on); });
  handle('widget:resize', function (o, event) {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const w = Math.max(200, Math.min(800, o.w | 0));
    const h = Math.max(150, Math.min(700, o.h | 0));
    win.setBounds({ width: w, height: h });
    if (o.save) {
      if (choiceWin && win === choiceWin) store.updateSettings({ widget: { choice: { w: w, h: h } } });
      else if (carouselWin && win === carouselWin) store.updateSettings({ widget: { carousel: { w: w, h: h } } });
      else {
        const id = Object.keys(stickerWins).find(function (k) { return stickerWins[k] === win; });
        if (id) store.updateSticker(id, { w: w, h: h });
      }
    }
    return true;
  });
  handle('choice:kbmode', function (on) { return setKbMode(!!on); });

  handle('backup:export', async function () {
    const r = await dialog.showSaveDialog(win, {
      title: '导出全部数据备份',
      defaultPath: 'momo-backup-' + new Date().toISOString().slice(0, 10) + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(store.exportAll()));
    return r.filePath;
  });
  handle('backup:import', async function () {
    const r = await dialog.showOpenDialog(win, {
      title: '导入备份',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return null;
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    store.importAll(data);
    broadcast('data:changed', null);
    broadcast('settings:changed', store.getSettings());
    broadcast('stickers:changed', store.listStickers());
    syncStickers();
    return true;
  });

  handle('app:dataDir', function () {
    shell.openPath(dataDir());
    return dataDir();
  });
  handle('app:info', function () {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      dataDir: dataDir(),
      books: store.listBooks().length
    };
  });
  handle('app:quit', function () { quitting = true; app.quit(); return true; });
  handle('window:min', function () { if (win) win.minimize(); });
  handle('confirm', async function (o) {
    const r = await dialog.showMessageBox(win, {
      type: o.type || 'question',
      buttons: o.buttons || ['取消', '确定'],
      defaultId: (o.buttons || ['取消', '确定']).length - 1,
      cancelId: 0,
      title: o.title || '确认',
      message: o.message || '确定吗？',
      detail: o.detail || ''
    });
    return r.response;
  });
}

/* 键盘答题模式：开启后数字键 1-4 全局路由到选题浮窗（用户显式开启，避免干扰日常打字） */
const KB_KEYS = ['1', '2', '3', '4'];
function setKbMode(on) {
  try {
    KB_KEYS.forEach(function (k) { try { globalShortcut.unregister(k); } catch (e) {} });
    if (on) {
      KB_KEYS.forEach(function (k, i) {
        globalShortcut.register(k, function () {
          if (choiceWin && !choiceWin.isDestroyed()) {
            choiceWin.webContents.send('kb:answer', i);
          }
        });
      });
    }
  } catch (e) { flog('键盘答题注册失败 ' + (e && e.message)); return false; }
  store.updateSettings({ widget: { choice: { kbMode: !!on } } });
  broadcast('settings:changed', store.getSettings());
  return true;
}

/* ---------------- 应用生命周期 ---------------- */
app.whenReady().then(function () {
  flog('app ready');
  migrateDataDir();
  store.init(dataDir());
  flog('store inited at ' + dataDir());
  seedBuiltinBooks();
  registerIpc();
  createMain();
  flog('main window created');
  createTray();
  /* 恢复上次开启的插件 */
  const s = store.getSettings();
  if (s.widget && s.widget.carousel && s.widget.carousel.on) toggleCarousel(true);
  if (s.widget && s.widget.choice && s.widget.choice.on) toggleChoice(true);
  syncStickers();
  /* 全局快捷键：Alt+Q 显示/隐藏选题浮窗（浮窗 focusable:false 永不抢焦点） */
  try {
    globalShortcut.register('Alt+Q', function () { toggleChoice(); });
  } catch (e) { flog('Alt+Q 注册失败 ' + (e && e.message)); }
  /* 键盘答题模式：开启后 1-4 全局路由到浮窗答题 */
  if (s.widget && s.widget.choice && s.widget.choice.kbMode) setKbMode(true);
  /* 冒烟测试：跑完自动退出 */
  if (process.env.MOMO_SMOKE) {
    /* 插件窗口视觉自检：截图 + DOM 探针 + 导入实测 */
    setTimeout(async function () {
      try {
        flog('WIDGET-TEST start');
        const shots = path.join(app.getPath('userData'), 'shots');
        fs.mkdirSync(shots, { recursive: true });
        const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
        async function shot(name, w) {
          if (!w || w.isDestroyed()) { flog('shot ' + name + ': WINDOW-GONE'); return; }
          const img = await w.webContents.capturePage();
          fs.writeFileSync(path.join(shots, name + '.png'), img.toPNG());
          flog('shot ' + name + ' ok');
        }
        toggleCarousel(true);
        await sleep(2500);
        if (carouselWin && !carouselWin.isDestroyed()) {
          const t = await carouselWin.webContents.executeJavaScript("document.getElementById('word').textContent");
          flog('carousel word=[' + t + ']');
          await shot('carousel', carouselWin);
        } else flog('carousel WINDOW-GONE');
        toggleChoice(true);
        await sleep(2500);
        if (choiceWin && !choiceWin.isDestroyed()) {
          const t = await choiceWin.webContents.executeJavaScript("document.getElementById('word').textContent");
          flog('choice word=[' + t + ']');
          await shot('choice', choiceWin);
          await choiceWin.webContents.executeJavaScript("var o=document.querySelectorAll('.opt'); if(o[1]) o[1].click();");
          await sleep(1400);
          const msg = await choiceWin.webContents.executeJavaScript("document.getElementById('msg').innerHTML");
          flog('choice answer-msg=[' + msg + ']');
          await shot('choice2', choiceWin);
        } else flog('choice WINDOW-GONE');
        const bid = store.getSettings().activeBookId;
        const w0 = store.getWords(bid)[0];
        const stk = store.createSticker({ bookId: bid, wordId: w0.id, space: '默认' });
        syncStickers();
        await sleep(2600);
        const swin = stickerWins[stk.id];
        if (swin && !swin.isDestroyed()) {
          const t = await swin.webContents.executeJavaScript("document.getElementById('word').textContent");
          flog('sticker word=[' + t + ']');
          await shot('sticker', swin);
        } else flog('sticker WINDOW-MISSING');
        store.deleteSticker(stk.id); syncStickers();
        /* 导入实测（真实词库文件 → 新建临时词库） */
        try {
          const tb = store.createBook({ name: '__import_test__' });
          const r2 = store.addWords(tb.id, require('./lib/importer').parseImport(fs.readFileSync('D:\\浏览器下载\\1521164635506_CET4_2\\CET4_2.json', 'utf8')).words);
          flog('import-test added=' + r2.added + ' dup=' + r2.dup);
          store.deleteBook(tb.id);
        } catch (e2) { flog('import-test FAIL ' + e2.message); }
        flog('WIDGET-TEST done');
      } catch (e) { flog('WIDGET-TEST fail ' + (e && e.message)); }
    }, 8000);
    setTimeout(function () { console.log('[SMOKE] timeout quit'); app.quit(); }, 75000);
  }
});

app.on('second-instance', function (argv) {
  showMain();
  const f = (argv || []).find(function (a) { return /\.json(on)?$/i.test(a); });
  if (f && win && !win.isDestroyed()) win.webContents.send('import:request', f);
});

app.on('open-file', function (e, p) {
  e.preventDefault();
  if (win && !win.isDestroyed()) win.webContents.send('import:request', p);
});

app.on('before-quit', function () { quitting = true; });
app.on('will-quit', function () { try { globalShortcut.unregisterAll(); } catch (e) {} });
app.on('window-all-closed', function (e) { /* 托盘驻留，不退出 */ });
